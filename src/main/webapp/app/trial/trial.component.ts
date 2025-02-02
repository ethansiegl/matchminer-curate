import { Component, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { AngularFireDatabase } from '@angular/fire/database';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/observable/combineLatest';
import { TrialService } from '../service/trial.service';
import * as _ from 'lodash';
import { Additional, Trial } from './trial.model';
import '../../../../../node_modules/jquery/dist/jquery.js';
import '../../../../../node_modules/datatables.net/js/jquery.dataTables.js';
import { Subject } from 'rxjs/Subject';
import { DataTableDirective } from 'angular-datatables';
import { NgModel } from '@angular/forms';
import { Router } from '@angular/router';
import { ConnectionService } from '../service/connection.service';
import { MetaService } from '../service/meta.service';
import { Meta } from '../meta/meta.model';
import { environment } from '../environments/environment';
import { saveAs } from 'file-saver';

@Component( {
    selector: 'jhi-trial',
    templateUrl: './trial.component.html',
    styleUrls: [ 'trial.scss' ]
} )

export class TrialComponent implements OnInit, AfterViewInit {
    oncokb = environment['oncokb'] ? environment['oncokb'] : false;
    @ViewChild( DataTableDirective )
    dtElement: DataTableDirective;
    trialsToImport = '';
    nctIdChosen = '';
    messages: Array<string> = [];
    trialList: Array<Trial> = [];
    trialChosen = {};
    additionalInput: Additional;
    additionalChosen: Additional;
    additionalsObject = {};
    noteEditable = false;
    trialListIds: string[] = [];
    dtOptions: DataTables.Settings = {};
    dtTrigger: Subject<any> = new Subject();
    hideArchived = 'Yes';
    statusOptions = this.trialService.getStatusOptions();
    originalTrial = {};
    isPermitted = this.trialService.isPermitted;
    protocolNoMessage = {
        content: '',
        color: ''
    };
    @ViewChild( 'selectModel' ) private selectModel: NgModel;

    constructor( private trialService: TrialService, private metaService: MetaService, public db: AngularFireDatabase,
        private connectionService: ConnectionService, private router: Router ) {
        this.trialService.nctIdChosenObs.subscribe( ( message ) => this.nctIdChosen = message );
        this.trialService.trialChosenObs.subscribe( ( message ) => this.trialChosen = message );
        this.trialService.trialListObs.subscribe( ( message ) => {
            this.trialList = message;
            this.trialListIds = this.trialService.trialListIds;
            this.rerender();
        } );
        this.trialService.additionalChosenObs.subscribe( ( message ) => this.additionalChosen = message );
        this.trialService.additionalObs.subscribe( ( message ) => {
            this.additionalsObject = message;
        } );
    }
    ngOnInit(): void {
        $.fn[ 'dataTable' ].ext.search.push( ( settings, data ) => {
            if ( this.hideArchived === 'Yes' && data[ 5 ] === 'Yes' ) {
                return false;
            } else if ( this.hideArchived === 'No' && data[ 5 ] === 'No' ) {
                return false;
            } else {
                return true;
            }
        } );
        this.dtOptions = {
            paging: true,
            scrollY: '300',
            columns: [
                { 'width': '15%' },
                { 'width': '10%' },
                { 'width': '15%' },
                { 'width': '40%' },
                { 'width': '10%' },
                { 'width': '10%' }
            ]
        };
        this.nctIdChosen = '';
        this.trialChosen = {};
        this.messages = [];
        if ( this.router.url.includes( 'NCT' ) ) {
            const urlArray = this.router.url.split( '/' );
            const nctId = urlArray[ 2 ];
            let protocolNo = '';
            if (urlArray.length > 3) {
                protocolNo = urlArray[ 3 ];
            }
            if (this.trialListIds.includes(nctId)) {
                this.curateTrial( nctId );
            } else {
                this.importTrialsFromNct(nctId, protocolNo);
            }

        }
    }
    importTrials() {
        this.messages = [];
        this.protocolNoMessage.content = '';
        const newTrials: Array<string> = this.trialsToImport.split( ',' );
        let nctId = '';
        let protocolNo = '';
        for ( const newTrial of newTrials ) {
            const tempTrial = newTrial.trim();
            if ( tempTrial.length === 0 ) {
                continue;
            } else if ( tempTrial.match( /NCT[0-9]+/g ) ) {
                nctId = tempTrial;
                if ( this.trialListIds.includes( tempTrial ) ) {
                    if (!this.isRedownloadTrial(tempTrial)) {
                        continue;
                    }
                }
                this.importTrialsFromNct(nctId, '');
            } else if ( tempTrial.match( /^\d+-\d+$/g ) ) {
                this.connectionService.getTrialByProtocolNo( tempTrial ).subscribe( ( res ) => {
                    protocolNo = res['msk_id'];
                    nctId = res['tds_data']['nct_id'];
                    if ( this.trialListIds.includes( nctId ) ) {
                        if (!this.isRedownloadTrial(tempTrial + '/' + nctId)) {
                            return;
                        }
                    }
                    this.importTrialsFromNct(nctId, protocolNo);
                }, ( error ) => {
                    this.messages.push( tempTrial + ' not found' );
                });
            } else {
                this.messages.push( tempTrial + ' is invalid trial format' );
                continue;
            }
        }
        this.trialsToImport = '';
    }

    isRedownloadTrial(id: string) {
        return confirm( 'Trial ' + id + ' has been loaded in database. ' +
                'Are you sure you want to overwrite this trial by loading file ' + id + '?' );
    }

    importTrialsFromNct(nctId: string, protocolNo: string) {
        let setChosenTrial = false;
        this.connectionService.importTrials( nctId ).subscribe( ( res ) => {
            const trialInfo = res;
            const armsInfo: any = [];
            _.forEach(trialInfo['arms'], function(arm) {
                if (arm.arm_description !== null) {
                    armsInfo.push({
                        arm_description: arm.arm_name,
                        arm_info: arm.arm_description,
                        match: []
                    });
                }
            });
            const trial: Trial = {
                curation_status: 'In progress',
                archived: 'No',
                protocol_no: protocolNo,
                nct_id: trialInfo['nct_id'],
                long_title: trialInfo['official_title'],
                short_title: trialInfo['brief_title'],
                phase: trialInfo['phase']['phase'],
                status: trialInfo['current_trial_status'],
                drug_list: {'drug': []},
                age: '',
                protocol_target_accrual: trialInfo['minimum_target_accrual_number'],
                summary: trialInfo['brief_title'],
                prior_treatment_requirement: [],
                staff_list: {protocol_staff: [{}]},
                sponsor: trialInfo['lead_org'],
                principal_investigator: trialInfo['principal_investigator'],
                site_list: {site: trialInfo['sites']},
                protocol_type: trialInfo['primary_purpose']['primary_purpose_code'],
                treatment_list: {
                    step: [{
                        arm: armsInfo,
                        match: []
                    }]
                }
            };

            const min_age = trialInfo['eligibility']['structured']['min_age'].match(/\d+/g).map(Number)[0];
            const max_age = trialInfo['eligibility']['structured']['max_age'].match(/\d+/g).map(Number)[0];
            if (min_age >= 18) {
                trial['age'] = 'Adults';
            } else if (max_age <= 18) {
                trial['age'] = 'Children';
            }
            for (let elg of  trialInfo['eligibility']['unstructured']) {
                trial.prior_treatment_requirement.push(elg.description);
            }

            this.db.object( 'Trials/' + trialInfo[ 'nct_id' ] ).set( trial ).then( ( response ) => {
                this.messages.push( 'Successfully imported ' + trialInfo[ 'nct_id' ] );
                if (this.oncokb) {
                    const metaRecord: Meta = {
                        protocol_no: protocolNo,
                        nct_id: trialInfo[ 'nct_id' ],
                        title: trialInfo[ 'official_title' ],
                        status: trialInfo[ 'current_trial_status' ],
                        precision_medicine: 'YES',
                        curated: 'YES'
                    };
                    this.metaService.setMetaRecord(metaRecord);
                }
                if ( setChosenTrial === false ) {
                    this.nctIdChosen = trialInfo[ 'nct_id' ];
                    this.trialService.setTrialChosen( this.nctIdChosen );
                    this.originalTrial = _.clone(this.trialChosen);
                    setChosenTrial = true;
                }
            } ).catch( ( error ) => {
                this.messages.push( 'Fail to save to database ' + nctId );
            } );
        }, ( error ) => {
            this.messages.push( nctId + ' not found' );
        } );
    }

    updateStatus( type: string ) {
        if ( type === 'curation' ) {
            this.db.object( 'Trials/' + this.nctIdChosen ).update( {
                curation_status: this.trialChosen[ 'curation_status' ]
            } ).then( ( result ) => {
                console.log( 'success saving curation status' );
            } ).catch( ( error ) => {
                console.log( 'error', error );
            } );
        } else if ( type === 'archive' ) {
            this.db.object( 'Trials/' + this.nctIdChosen ).update( {
                archived: this.trialChosen[ 'archived' ]
            } ).then( ( result ) => {
                console.log( 'success saving archive status' );
                if ( this.trialChosen[ 'archived' ] === 'Yes' ) {
                    this.curateTrial( '' );
                }
            } ).catch( ( error ) => {
                console.log( 'error', error );
            } );
        } else if ( type === 'hideArchived' ) {
            this.dtElement.dtInstance.then( ( dtInstance: DataTables.Api ) => {
                dtInstance.draw();
            } );
        }
    }
    curateTrial( nctId: string ) {
        this.protocolNoMessage.content = '';
        this.clearAdditional();
        this.trialService.setTrialChosen( nctId );
        this.trialService.setAdditionalChosen( nctId );
        this.originalTrial = _.clone(this.trialChosen);
        document.querySelector( '#trialDetail' ).scrollIntoView();
    }
    clearAdditional() {
        this.additionalChosen = { note: '' };
    }
    getStatus( status: string ) {
        let color = '';
        if (status === 'Completed') {
            color = 'green';
        } else if (status === 'In progress') {
            color = 'red';
        } else {
            color = '#3E8ACC';
        }
        return { 'color': color };
    }
    ngAfterViewInit(): void {
        this.dtTrigger.next();
    }
    rerender(): void {
        if ( ! _.isUndefined( this.dtElement ) ) {
            this.dtElement.dtInstance.then( ( dtInstance: DataTables.Api ) => {
                // Destroy the table first
                dtInstance.destroy();
                // Call the dtTrigger to rerender again
                this.dtTrigger.next();
            } );
        }
    }
    updateTrialStatusInDB() {
        if ( this.originalTrial['status'] !== this.trialChosen[ 'status' ] ) {
            this.trialService.getRef( 'Trials/' + this.nctIdChosen + '/status' ).set( this.trialChosen[ 'status' ] ).then( ( result ) => {
                console.log( 'Save to DB Successfully!' );
            } ).catch( ( error ) => {
                console.log( 'Failed to save to DB ', error );
                const errorMessage = 'Sorry, the trial status is failed to save to database.';
                this.trialService.saveErrors(
                    errorMessage,
                    {
                        nctId: this.trialChosen[ 'nct_id' ],
                        oldContent: 'trial status: ' + this.originalTrial[ 'status' ],
                        newContent: 'trial status: ' + this.trialChosen[ 'status' ]
                    },
                    error
                );
                alert( errorMessage );
                // Rollback the trial status in ng-select option
                this.selectModel.reset( this.originalTrial[ 'status' ] );
                this.trialChosen[ 'status' ] = this.originalTrial[ 'status' ];
            } );
        }
    }
    editNote() {
        this.noteEditable = true;
        // We have to use _.clone to make a copy of additionalChosen.
        // Otherwise, its value will be effected by additionalInput when we make changes but not save them.
        const additionalToEdit = _.clone( this.additionalChosen );
        this.additionalInput = additionalToEdit;
    }
    updateNote() {
        this.trialService.getRef( 'Additional/' + this.nctIdChosen + '/note' ).set( this.additionalInput.note ).then( ( result ) => {
            console.log( 'Save Additional Info to DB Successfully!' );
            this.cancelUpdateNote();
            this.trialService.setAdditionalChosen( this.nctIdChosen );
        } ).catch( ( error ) => {
            console.log( 'Failed to save Additional Info to DB ', error );
            const errorMessage = 'Sorry, the Additional Info is failed to save to database.';
            alert( errorMessage );
        } );
    }
    cancelUpdateNote() {
        this.noteEditable = false;
    }
    updateProtocolNo() {
        if ( this.trialChosen['protocol_no'].match( /^\d+-\d+$/g ) ) {
            const result = confirm('Are you sure to update Protocol No. to ' + this.trialChosen['protocol_no'] + '?');
            if (result) {
                this.trialService.getRef( 'Trials/' + this.nctIdChosen ).update( {protocol_no: this.trialChosen['protocol_no']} )
                .then((res) => {
                    this.protocolNoMessage.content = 'Update Protocol No. successfully.';
                    this.protocolNoMessage.color = 'green';
                })
                .catch( ( error ) => {
                    this.protocolNoMessage.content = 'Failed to update Protocol No.';
                    this.protocolNoMessage.color = 'red';
                    this.trialChosen['protocol_no'] = this.originalTrial['protocol_no'];
                } );
            }
        } else {
            this.protocolNoMessage.content = 'Protocol No. should follow the format: number-number.';
            this.protocolNoMessage.color = 'red';
            this.trialChosen['protocol_no'] = this.originalTrial['protocol_no'];
        }
    }
    clearMessage(type: string) {
        if (type === 'protocol_no') {
            this.protocolNoMessage.content = '';
            this.protocolNoMessage.color = '';
        }
    }
    download() {
        const content = [];
        const headers = ['Nct Id', 'Protocol No', 'Status', 'Title', 'Curation Status', 'Archived'];
        content.push(headers.join('\t'));
        this.trialList.map((row) => {
            content.push([row['nct_id'], row['protocol_no'], row['status'], row['short_title'].replace(/\n/g, ''), row['curation_status'], row['archived']].join('\t'));
        });
        const blob = new Blob([content.join('\n')], {
            type: 'text/plain;charset=utf-8;',
        });
        saveAs(blob, 'TrialTable.xls');
    }
}
